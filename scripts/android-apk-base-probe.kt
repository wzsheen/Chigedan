/*
 * Add these members inside the developer tools' generated NativePluginBase class.
 * Invoke apkDeltaBaseInfo via the generated plugin's JS bridge.
 */
@AsyncJsApi(methodName = "apkDeltaBaseInfo")
fun apkDeltaBaseInfo(
    data: JSONObject?,
    callback: (data: Any) -> Unit,
    activity: Activity
) {
    val source = activity.applicationInfo.sourceDir
    Thread {
        val result = try {
            val apk = java.io.File(source)
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            apk.inputStream().buffered().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                }
            }
            val sha256 = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
            hashMapOf<String, Any>("ok" to true, "bytes" to apk.length(), "sha256" to sha256)
        } catch (_: Exception) {
            hashMapOf<String, Any>("ok" to false, "error" to "base_apk_unreadable")
        }
        activity.runOnUiThread { callback(result) }
    }.start()
}

// Add to the generated plugin class registered as chigedan-apk-delta.
// The bridge calls back on the UI thread. The APK is staged in app cache.
@AsyncJsApi(methodName = "applyApkDelta")
fun applyApkDelta(data: JSONObject?, callback: (data: Any) -> Unit, activity: Activity) {
    Thread {
        var patch: java.io.File? = null
        var output: java.io.File? = null
        val result = try {
            val args = requireNotNull(data)
            require(args.getString("format") == "apk-copy-gzip-v1")
            val base = java.io.File(activity.applicationInfo.sourceDir)
            require(apkDeltaSha256(base) == args.getString("baseSha256"))
            val url = java.net.URL(args.getString("url"))
            require(url.protocol == "https")
            val limit = 256L * 1024 * 1024
            val buffer = ByteArray(64 * 1024)
            val patchFile = java.io.File.createTempFile("apk-delta-", ".gz", activity.cacheDir)
            patch = patchFile
            val connection = url.openConnection() as javax.net.ssl.HttpsURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 20000
            try {
                require(connection.responseCode == 200)
                connection.inputStream.use { input ->
                    patchFile.outputStream().use { sink ->
                        var size = 0L
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            size += count
                            require(size <= limit)
                            sink.write(buffer, 0, count)
                        }
                    }
                }
            } finally {
                connection.disconnect()
            }
            require(apkDeltaSha256(patchFile) == args.getString("patchSha256"))
            val apkFile = java.io.File.createTempFile("apk-delta-", ".apk", activity.cacheDir)
            output = apkFile
            java.io.RandomAccessFile(base, "r").use { source ->
                java.io.DataInputStream(java.util.zip.GZIPInputStream(patchFile.inputStream())).use { input ->
                    apkFile.outputStream().buffered().use { sink ->
                        var size = 0L
                        while (true) {
                            val op = input.read()
                            if (op < 0) break
                            val value = Integer.reverseBytes(input.readInt()).toLong() and 0xffffffffL
                            val length = when (op) {
                                0 -> value
                                1 -> {
                                    val count = Integer.reverseBytes(input.readInt()).toLong() and 0xffffffffL
                                    require(value + count <= source.length())
                                    source.seek(value)
                                    count
                                }
                                else -> error("Unknown delta operation")
                            }
                            size += length
                            require(size <= limit)
                            var remaining = length
                            while (remaining > 0) {
                                val count = minOf(remaining, buffer.size.toLong()).toInt()
                                if (op == 0) input.readFully(buffer, 0, count)
                                else source.readFully(buffer, 0, count)
                                sink.write(buffer, 0, count)
                                remaining -= count
                            }
                        }
                    }
                }
            }
            require(apkDeltaSha256(apkFile) == args.getString("targetSha256"))
            hashMapOf<String, Any>("ok" to true, "filePath" to apkFile.absolutePath)
        } catch (_: Exception) {
            output?.delete()
            hashMapOf<String, Any>("ok" to false)
        } finally {
            patch?.delete()
        }
        activity.runOnUiThread { callback(result) }
    }.start()
}

private fun apkDeltaSha256(file: java.io.File): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
