package com.falconoon.sealworks.plugins

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyFactory
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Arrays
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The sealer's private key. It is kept here, never in the page:
 *
 *   noBackupFilesDir/seal/key.bin = "PDFEK1O\n" "SWKS2\n" u16 len | public key (SPKI) | IV (12) | AES-256-GCM(PKCS#8)
 *
 * encrypted with a non-exportable AES-256-GCM key in the Android Keystore (alias [ALIAS]).
 * The seal worker (desktop/src/seal.js, bundled) reaches it with synchronous GET requests to
 * https://localhost/_sealworks/<op>, answered from MainActivity's shouldInterceptRequest before any
 * network code (the app has no INTERNET permission anyway):
 *
 *   store  ?path=seal/key.bin[.<x>.tmp]&k=<PKCS#8>&p=<SPKI>   new identity (create/import): checks the pair, encrypts, writes
 *   sign   ?alg=sha256|sha384|sha512&d=<CMS signed attributes>&fp=<sha256(SPKI) hex>   -> base64 signature
 *   export ?fp=…                                              -> base64 PKCS#8, once, within 2 minutes after
 *                                                                the user picked where a .p12 backup goes ([grantExport])
 *
 * Binary parameters are base64url. Errors: status 400/403/404/500, body "CODE: message".
 */
object SealKeys {
    const val ALIAS = "sealworks.seal.kek.v1"
    private val MAGIC_OS = "PDFEK1O\n".toByteArray()
    private val STORED = "SWKS2\n".toByteArray()
    private const val PREFIX = "/_sealworks/"
    private const val TICKET_MS = 120_000L
    private val PATH_RE = Regex("^seal/key\\.bin(\\.[A-Za-z0-9]{1,32}\\.tmp)?$")
    private val OID_MESSAGE_DIGEST = byteArrayOf(0x06, 0x09, 0x2a, 0x86.toByte(), 0x48, 0x86.toByte(), 0xf7.toByte(), 0x0d, 0x01, 0x09, 0x04)
    @Volatile private var exportUntil = 0L

    class KeyError(val status: Int, val code: String, msg: String) : Exception("$code: $msg")

    fun handles(u: Uri) = u.scheme == "https" && u.host == "localhost" && (u.path ?: "").startsWith(PREFIX)

    /** The user just picked where a .p12 backup goes: one export may follow. */
    fun grantExport() { exportUntil = SystemClock.elapsedRealtime() + TICKET_MS }

    fun handle(ctx: Context, req: WebResourceRequest): WebResourceResponse {
        return try {
            if (req.method != "GET") throw KeyError(405, "EINVAL", "GET only")
            val u = req.url
            val body = when ((u.path ?: "").removePrefix(PREFIX)) {
                "store" -> { store(ctx, u.getQueryParameter("path"), b64(u, "k"), b64(u, "p")); "ok" }
                "sign" -> Base64.encodeToString(sign(ctx, u.getQueryParameter("alg") ?: "sha256", b64(u, "d"), u.getQueryParameter("fp")), Base64.NO_WRAP)
                "export" -> export(ctx, u.getQueryParameter("fp"))
                else -> throw KeyError(404, "EINVAL", "unknown operation")
            }
            respond(200, "OK", body)
        } catch (e: KeyError) {
            respond(e.status, "Error", e.message ?: "EIO")
        } catch (e: Exception) {
            respond(500, "Error", "EIO: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun respond(status: Int, reason: String, text: String) =
        WebResourceResponse("text/plain", "utf-8", status, reason,
            mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff"),
            ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)))

    private fun b64(u: Uri, k: String): ByteArray {
        val s = u.getQueryParameter(k) ?: throw KeyError(400, "EINVAL", "$k missing")
        return try { Base64.decode(s, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) } catch (_: IllegalArgumentException) { throw KeyError(400, "EINVAL", "$k is not base64url") }
    }

    private fun sealDir(ctx: Context) = File(ctx.noBackupFilesDir, "seal")

    @Synchronized
    private fun kek(create: Boolean): SecretKey? {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        if (!create) return null
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build())
        }.generateKey()
    }

    private fun privateKey(pkcs8: ByteArray): PrivateKey {
        for (alg in listOf("RSA", "EC")) {
            try { return KeyFactory.getInstance(alg).generatePrivate(PKCS8EncodedKeySpec(pkcs8)) } catch (_: Exception) {}
        }
        throw KeyError(400, "EINVAL", "unsupported key type (RSA or EC only)")
    }

    private fun publicKey(spki: ByteArray, alg: String): PublicKey =
        try { KeyFactory.getInstance(alg).generatePublic(X509EncodedKeySpec(spki)) } catch (e: Exception) { throw KeyError(400, "EINVAL", "bad public key") }

    private fun signer(key: PrivateKey, hash: String): Signature {
        val h = when (hash.lowercase()) { "sha256" -> "SHA256"; "sha384" -> "SHA384"; "sha512" -> "SHA512"; else -> throw KeyError(400, "EINVAL", "unsupported hash $hash") }
        return Signature.getInstance("${h}with${if (key.algorithm == "EC") "ECDSA" else "RSA"}").apply { initSign(key) }
    }

    private fun store(ctx: Context, path: String?, pkcs8: ByteArray, spki: ByteArray) {
        try {
            if (path == null || !PATH_RE.matches(path)) throw KeyError(400, "EINVAL", "bad key path")
            val key = privateKey(pkcs8)
            // the public key must belong to the private key
            val probe = "Sealworks key check".toByteArray()
            val sig = signer(key, "sha256").apply { update(probe) }.sign()
            val v = Signature.getInstance(if (key.algorithm == "EC") "SHA256withECDSA" else "SHA256withRSA")
            v.initVerify(publicKey(spki, key.algorithm)); v.update(probe)
            if (!v.verify(sig)) throw KeyError(400, "EINVAL", "the public key does not match the private key")
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, kek(true))
            if (c.iv.size != 12) throw KeyError(500, "EIO", "unexpected IV length")
            val ct = c.doFinal(pkcs8)
            val dir = sealDir(ctx)
            if (!dir.isDirectory && !dir.mkdirs()) throw KeyError(500, "EIO", "no seal folder")
            val out = ByteBuffer.allocate(MAGIC_OS.size + STORED.size + 2 + spki.size + 12 + ct.size)
                .put(MAGIC_OS).put(STORED).putShort(spki.size.toShort()).put(spki).put(c.iv).put(ct).array()
            File(dir, path.removePrefix("seal/")).writeBytes(out)
        } finally { Arrays.fill(pkcs8, 0) }
    }

    /** key.bin -> (SPKI, PKCS#8); the caller zeroes the PKCS#8 */
    private fun load(ctx: Context, fp: String?): Pair<ByteArray, ByteArray> {
        val f = File(sealDir(ctx), "key.bin")
        if (!f.isFile) throw KeyError(404, "ENOENT", "there is no sealer key")
        val b = ByteBuffer.wrap(f.readBytes())
        val head = ByteArray(MAGIC_OS.size + STORED.size).also { b.get(it) }
        if (!head.contentEquals(MAGIC_OS + STORED)) throw KeyError(500, "EIO", "unknown key file format")
        val spki = ByteArray(b.short.toInt() and 0xffff).also { b.get(it) }
        if (fp == null || !MessageDigest.isEqual(hex(MessageDigest.getInstance("SHA-256").digest(spki)).toByteArray(), fp.lowercase().toByteArray())) {
            throw KeyError(409, "EIO", "the sealer key changed")
        }
        val iv = ByteArray(12).also { b.get(it) }
        val ct = ByteArray(b.remaining()).also { b.get(it) }
        val kek = kek(false) ?: throw KeyError(500, "EIO", "the Android Keystore key is gone (restore the identity from a .p12 backup)")
        val pkcs8 = try {
            Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, kek, GCMParameterSpec(128, iv)) }.doFinal(ct)
        } catch (e: Exception) { throw KeyError(500, "EIO", "the Android Keystore did not unlock the sealer key (${e.javaClass.simpleName})") }
        return spki to pkcs8
    }

    private fun sign(ctx: Context, hash: String, data: ByteArray, fp: String?): ByteArray {
        // only CMS signed attributes (a DER SET with a messageDigest attribute): this signs seals, nothing else
        if (data.size < 16 || data.size > 8192 || data[0] != 0x31.toByte() || indexOf(data, OID_MESSAGE_DIGEST) < 0) {
            throw KeyError(400, "EINVAL", "only CMS signed attributes are signed")
        }
        val (_, pkcs8) = load(ctx, fp)
        try { return signer(privateKey(pkcs8), hash).apply { update(data) }.sign() }
        finally { Arrays.fill(pkcs8, 0) }
    }

    private fun export(ctx: Context, fp: String?): String {
        val ok = synchronized(this) { val t = exportUntil; exportUntil = 0; t > SystemClock.elapsedRealtime() }
        if (!ok) throw KeyError(403, "EPERM", "a backup needs the user's save panel first")
        val (_, pkcs8) = load(ctx, fp)
        try { return Base64.encodeToString(pkcs8, Base64.NO_WRAP) } finally { Arrays.fill(pkcs8, 0) }
    }

    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
    private fun indexOf(h: ByteArray, n: ByteArray): Int {
        outer@ for (i in 0..h.size - n.size) { for (j in n.indices) if (h[i + j] != n[j]) continue@outer; return i }
        return -1
    }
}
