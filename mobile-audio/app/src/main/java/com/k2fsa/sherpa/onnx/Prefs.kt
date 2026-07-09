package com.k2fsa.sherpa.onnx

import android.content.Context

/** Tiny SharedPreferences wrapper for the app's settings. */
object Prefs {
    private const val NAME = "mobileaudio"
    private fun sp(c: Context) = c.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun geminiKey(c: Context): String = sp(c).getString("gemini_key", "")!!.trim()
    fun setGeminiKey(c: Context, v: String) = sp(c).edit().putString("gemini_key", v.trim()).apply()

    fun english(c: Context): Boolean = sp(c).getBoolean("english", false)
    fun setEnglish(c: Context, v: Boolean) = sp(c).edit().putBoolean("english", v).apply()

    // "jyut" or "pinyin"
    fun reading(c: Context): String = sp(c).getString("reading", "jyut")!!
    fun setReading(c: Context, v: String) = sp(c).edit().putString("reading", v).apply()
}
