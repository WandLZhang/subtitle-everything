package com.k2fsa.sherpa.onnx

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Optional English line via Gemini (flash-lite for speed). Key comes from Settings. */
object Translator {
    private const val MODEL = "gemini-flash-lite-latest"

    /** Blocking. Call off the main thread. Returns null on any failure (English line just hides). */
    fun translate(text: String, key: String): String? {
        if (key.isBlank() || text.isBlank()) return null
        return try {
            val url = URL(
                "https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent?key=$key"
            )
            val c = url.openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            val body = JSONObject().apply {
                put(
                    "contents",
                    JSONArray().put(
                        JSONObject().put(
                            "parts",
                            JSONArray().put(
                                JSONObject().put(
                                    "text",
                                    "Translate this Hong Kong colloquial Cantonese to natural English. " +
                                        "Return only the translation:\n\n" + text
                                )
                            )
                        )
                    )
                )
                put(
                    "generationConfig",
                    JSONObject().put("temperature", 0.2).put("maxOutputTokens", 512)
                )
            }
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (c.responseCode != 200) { c.disconnect(); return null }
            val resp = c.inputStream.bufferedReader().readText()
            c.disconnect()
            JSONObject(resp)
                .getJSONArray("candidates").getJSONObject(0)
                .getJSONObject("content").getJSONArray("parts").getJSONObject(0)
                .getString("text").trim()
        } catch (e: Exception) {
            null
        }
    }
}
