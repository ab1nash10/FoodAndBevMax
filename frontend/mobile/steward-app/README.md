# F&B Deliveries (steward phone app)

The delivery person's app: sign in with a mobile code, get rung for room orders given to you and
when they're ready, mark them Delivered (Undo for 5 s) or "Couldn't deliver" with a reason.
React Native with Expo; its own npm project (outside the pnpm workspace).

## Try it on an Android phone, against the dev stack on this PC

1. Run `pnpm dev` at the repo root as usual (services on 4001–4003).
2. Here: `npm install`, then `npm start`.
3. On the phone install **Expo Go** (Play Store) and open the app from it:
   - **USB (works on any network):** turn on USB debugging on the phone (Settings › About phone ›
     tap Build number 7 times; then Developer options › USB debugging), plug it in, tap Allow,
     and run `npm run phone`. It links the phone's localhost 8081/4001/4003 to this PC
     (`adb reverse`) and opens the app on the phone. It needs Android platform-tools in
     `%LOCALAPPDATA%\Android\Sdk\platform-tools` (Google's zip, unpacked there) or `ANDROID_HOME`.
     If `adb devices` lists nothing with the phone plugged in, set the cable mode to File
     transfer, or install the phone maker's USB driver (Samsung, Xiaomi…).
   - **Same Wi-Fi:** scan the QR code `npm start` shows. Windows Firewall must let Node accept
     connections on 8081, 4001 and 4003.

The app calls the services on whatever address the phone reached this PC at (`lib/api.ts`).
On the dev stack the code `000000` signs in without an SMS; Send code texts a real one.

## Checks

`npx tsc --noEmit`, `npx eslint .`, `npm test` (the ring rules), `npx expo-doctor`.

## Not yet

- Ringing on a locked phone (push notifications: Firebase + the AWS address).
- An installable APK / iOS build (EAS cloud build with an Expo account, or Android tools here).
- The AWS address: needs a `*.maxhealthcare.com` name for the load balancer (its certificate).
