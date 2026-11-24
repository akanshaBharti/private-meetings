// Copy to the Jitsi Docker CONFIG/web/custom-config.js file.
// docker-jitsi-meet appends this file to the generated config.js on restart.

config.disableDeepLinking = true;
config.disableInviteFunctions = true;
config.defaultLocalDisplayName = "You";
config.defaultRemoteDisplayName = "Participant";
config.prejoinConfig = {
    ...(config.prejoinConfig || {}),
    enabled: true,
    hideDisplayName: false,
};
config.toolbarButtons = [
    "microphone",
    "camera",
    "desktop",
    "fullscreen",
    "fodeviceselection",
    "hangup",
    "raisehand",
    "videoquality",
    "tileview",
    "settings",
    "select-background",
];
