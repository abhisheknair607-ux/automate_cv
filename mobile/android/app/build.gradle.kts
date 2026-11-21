plugins {
    id("com.android.application")
}
android {
    namespace = "app.garamaal.browser"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.garamaal.browser"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
