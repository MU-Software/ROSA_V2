import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val keystoreProperties = Properties().apply {
    val propFile = file("../key.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    // Kotlin 패키지이자 JNI 심볼의 근거라 identifier 와 같아야 한다. Play 이름은
    // applicationId 쪽이고, com.musoftware.rosa 가 점유되어 있어 갈라 뒀다.
    namespace = "com.musoftware.rosa"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "kr.co.musoftware.rosa"
        minSdk = 24
        targetSdk = 36
        versionCode = (System.getenv("ROSA_ANDROID_VERSION_CODE")
            ?: tauriProperties.getProperty("tauri.android.versionCode", "1")).toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            val storeFilePath = keystoreProperties.getProperty("storeFile")
            if (storeFilePath != null) {
                storeFile = file(storeFilePath)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (keystoreProperties.containsKey("storeFile")) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")