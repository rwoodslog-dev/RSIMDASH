// Copie l'appli web (../web) dans www/ pour l'embarquer dans l'APK.
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "..", "web"), dst = path.join(__dirname, "www");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log("web -> www copie");
