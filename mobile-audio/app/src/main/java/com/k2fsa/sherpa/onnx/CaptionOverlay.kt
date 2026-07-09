package com.k2fsa.sherpa.onnx

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A floating, draggable caption window. Shows the 口語 line (each dict word tappable) plus an
 * optional English line, and a small popup with reading + definitions when a word is tapped.
 * Drag via the top handle so taps on the text still register.
 */
class CaptionOverlay(private val ctx: Context) {
    private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val main = Handler(Looper.getMainLooper())

    private lateinit var root: LinearLayout
    private lateinit var handle: TextView
    private lateinit var zh: TextView
    private lateinit var en: TextView
    private lateinit var popup: TextView
    private lateinit var params: WindowManager.LayoutParams
    private var shown = false

    fun show() {
        if (shown) return
        root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(28, 10, 28, 18)
        }
        handle = TextView(ctx).apply {
            text = "⠿  Subtitle Everything  ·  drag"
            textSize = 11f
            setTextColor(Color.parseColor("#9AA0A6"))
            setPadding(0, 0, 0, 8)
        }
        zh = TextView(ctx).apply {
            textSize = 23f
            setTextColor(Color.parseColor("#7FD7FF"))
            movementMethod = LinkMovementMethod.getInstance()
        }
        en = TextView(ctx).apply {
            textSize = 16f
            setTextColor(Color.parseColor("#FFD479"))
            visibility = View.GONE
        }
        popup = TextView(ctx).apply {
            textSize = 15f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#F21A1C22"))
            setPadding(22, 14, 22, 14)
            visibility = View.GONE
        }
        root.addView(handle)
        root.addView(zh)
        root.addView(en)
        root.addView(popup)

        params = WindowManager.LayoutParams(
            (ctx.resources.displayMetrics.widthPixels * 0.94).toInt(),
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = 160
        }
        enableDrag()
        wm.addView(root, params)
        shown = true
    }

    private fun enableDrag() {
        var ix = 0; var iy = 0; var dx = 0f; var dy = 0f
        handle.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { ix = params.x; iy = params.y; dx = e.rawX; dy = e.rawY; true }
                MotionEvent.ACTION_MOVE -> {
                    params.x = ix + (e.rawX - dx).toInt()
                    params.y = iy - (e.rawY - dy).toInt()
                    if (shown) wm.updateViewLayout(root, params)
                    true
                }
                else -> false
            }
        }
    }

    /** text should already be HK-traditional. Called from any thread. */
    fun update(text: String, english: String?, reading: String) {
        main.post {
            if (!shown) return@post
            zh.text = buildSpannable(text, reading)
            if (english.isNullOrBlank()) en.visibility = View.GONE
            else { en.text = english; en.visibility = View.VISIBLE }
            popup.visibility = View.GONE
        }
    }

    fun message(msg: String) {
        main.post { if (shown) { zh.text = msg; en.visibility = View.GONE; popup.visibility = View.GONE } }
    }

    private fun buildSpannable(text: String, reading: String): CharSequence {
        val sb = SpannableString(text)
        var i = 0
        while (i < text.length) {
            val n = Dict.matchLen(text, i)
            if (n > 0) {
                val start = i; val end = i + n
                val word = text.substring(start, end)
                sb.setSpan(object : ClickableSpan() {
                    override fun onClick(w: View) = showPopup(word, reading)
                    override fun updateDrawState(ds: TextPaint) {
                        ds.color = zh.currentTextColor
                        ds.isUnderlineText = false
                    }
                }, start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                i = end
            } else i++
        }
        return sb
    }

    private fun showPopup(word: String, reading: String) {
        val entries = Dict.lookup(word)
        if (entries.isEmpty()) { popup.visibility = View.GONE; return }
        val sb = StringBuilder(word)
        for (e in entries.take(4)) {
            val r = if (reading == "pinyin") e.py else e.jy.ifBlank { e.py }
            sb.append("\n").append(r).append("   ").append(e.defs.take(3).joinToString("; "))
        }
        popup.text = sb.toString()
        popup.visibility = View.VISIBLE
    }

    fun hide() {
        if (shown) {
            try { wm.removeView(root) } catch (e: Exception) {}
            shown = false
        }
    }
}
