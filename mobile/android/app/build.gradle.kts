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
        versionCode = 5
        versionName = "0.4.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Chrome Custom Tabs: approved browser session, customizable Capture Job toolbar.
    implementation("androidx.browser:browser:1.10.0")
}
