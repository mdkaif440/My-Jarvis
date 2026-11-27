package com.jarvis.companion.service

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class JarvisAccessibilityHelper : AccessibilityService() {
    companion object { @Volatile var isEnabled: Boolean = false }
    override fun onServiceConnected() { isEnabled = true }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() { isEnabled = false; super.onDestroy() }
}
