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
        versionCode = 3
        versionName = "0.2.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
