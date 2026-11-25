package com.falconoon.sealworks.plugins

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom

/**
 * Persistent table of documents the user picked, created or sent to the app:
 * id -> { uri, name, tree, persisted }. The page sees each one as "/android/<id>/<name>"
 * (a folder picked with OPEN_DOCUMENT_TREE is "/android/<id>", its files "/android/<id>/<name>").
 *
 * Kept in noBackupFilesDir: content:// URIs and their grants are meaningless on another device,
 * so a restored library shows those files as "needs permission" (EPERM) and the user re-grants.
 */
class DocTable(context: Context) {
    data class Entry(val id: String, val uri: Uri, var name: String, val tree: Boolean, var persisted: Boolean, var at: Long)

    private val file = File(context.noBackupFilesDir, "documents.json")
    private val entries = LinkedHashMap<String, Entry>()
    private val rnd = SecureRandom()

    init { load() }

    @Synchronized fun get(id: String): Entry? = entries[id]

    @Synchronized fun all(): List<Entry> = entries.values.toList()

    /** Same URI -> same id (re-picking a file keeps the page path, so library records keep working). */
    @Synchronized fun register(uri: Uri, name: String, tree: Boolean, persisted: Boolean): Entry {
        val key = uri.toString()
        val existing = entries.values.firstOrNull { it.uri.toString() == key && it.tree == tree }
        val e = if (existing != null) {
            existing.name = name
            existing.persisted = existing.persisted || persisted
            existing.at = System.currentTimeMillis()
            existing
        } else {
            var id: String
            do { id = newId() } while (entries.containsKey(id))
            Entry(id, uri, name, tree, persisted, System.currentTimeMillis()).also { entries[id] = it }
        }
        save()
        return e
    }

    @Synchronized fun rename(id: String, name: String) {
        entries[id]?.let { it.name = name; save() }
    }

    private fun newId(): String {
        val alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
        return (1..10).map { alphabet[rnd.nextInt(alphabet.length)] }.joinToString("")
    }

    private fun load() {
        try {
            if (!file.exists()) return
            val o = JSONObject(file.readText())
            for (k in o.keys()) {
                val e = o.getJSONObject(k)
                entries[k] = Entry(k, Uri.parse(e.getString("uri")), e.getString("name"), e.optBoolean("tree"), e.optBoolean("persisted"), e.optLong("at"))
            }
        } catch (_: Exception) {
            // a damaged table: keep a copy, start empty (the page then asks to re-grant)
            file.copyTo(File(file.parentFile, "documents.json.damaged-${System.currentTimeMillis()}"), overwrite = true)
        }
    }

    private fun save() {
        val o = JSONObject()
        for (e in entries.values) {
            o.put(e.id, JSONObject().put("uri", e.uri.toString()).put("name", e.name).put("tree", e.tree).put("persisted", e.persisted).put("at", e.at))
        }
        val tmp = File(file.parentFile, "documents.json.tmp")
        tmp.writeText(o.toString())
        if (!tmp.renameTo(file)) { file.writeText(o.toString()); tmp.delete() }
    }
}
