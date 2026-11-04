//
//  ViewController.swift
//  YouTubeAmbilight
//
//  Created by sespure on 28.09.2026.
//

import Cocoa
import SafariServices

let extensionBundleIdentifier = "com.youtubeambilight.safari.Extension"

class ViewController: NSViewController {

    private var statusImageView: NSImageView!
    private var titleLabel: NSTextField!
    private var statusLabel: NSTextField!
    private var actionButton: NSButton!

    override func loadView() {
        self.view = NSView(frame: NSRect(x: 0, y: 0, width: 440, height: 320))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        updateExtensionStatus()
    }

    override func viewWillAppear() {
        super.viewWillAppear()
        updateExtensionStatus()
    }

    private func setupUI() {
        view.wantsLayer = true

        // Icon
        statusImageView = NSImageView(frame: .zero)
        statusImageView.translatesAutoresizingMaskIntoConstraints = false
        statusImageView.imageScaling = .scaleProportionallyUpOrDown
        statusImageView.image = NSImage(named: "LargeIcon") ?? NSImage(named: "AppIcon") ?? NSImage(named: NSImage.applicationIconName)
        view.addSubview(statusImageView)

        // Title
        titleLabel = NSTextField(labelWithString: "YouTube Ambilight")
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = NSFont.systemFont(ofSize: 18, weight: .bold)
        titleLabel.alignment = .center
        view.addSubview(titleLabel)

        // Status Label
        statusLabel = NSTextField(wrappingLabelWithString: "Checking extension status…")
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.alignment = .center
        view.addSubview(statusLabel)

        // Action Button
        actionButton = NSButton(title: "Open Safari Settings…", target: self, action: #selector(openPreferencesClicked))
        actionButton.translatesAutoresizingMaskIntoConstraints = false
        actionButton.bezelStyle = .rounded
        actionButton.controlSize = .large
        actionButton.keyEquivalent = "\r"
        view.addSubview(actionButton)

        NSLayoutConstraint.activate([
            statusImageView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusImageView.topAnchor.constraint(equalTo: view.topAnchor, constant: 36),
            statusImageView.widthAnchor.constraint(equalToConstant: 96),
            statusImageView.heightAnchor.constraint(equalToConstant: 96),

            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            titleLabel.topAnchor.constraint(equalTo: statusImageView.bottomAnchor, constant: 16),
            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            titleLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),

            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 10),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),

            actionButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            actionButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 24),
            actionButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),
            actionButton.heightAnchor.constraint(equalToConstant: 32)
        ])
    }

    private func updateExtensionStatus() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] (state, error) in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let state = state {
                    if state.isEnabled {
                        self.statusLabel.stringValue = "Extension is currently enabled in Safari.\nYou can configure settings directly on YouTube."
                    } else {
                        self.statusLabel.stringValue = "Extension is installed. Turn it on in Safari Extensions settings to activate Ambilight."
                    }
                } else {
                    self.statusLabel.stringValue = "Extension is installed. Turn it on in Safari Extensions settings to activate Ambilight."
                }
            }
        }
    }

    @objc private func openPreferencesClicked() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { [weak self] error in
            if error != nil {
                DispatchQueue.main.async {
                    if let script = NSAppleScript(source: "tell application \"Safari\" to activate\ntell application \"System Events\" to tell process \"Safari\" to keystroke \",\" using command down") {
                        script.executeAndReturnError(nil)
                    }
                }
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            // Also open Safari and press Cmd+, via AppleScript if Safari is frontmost
            let scriptSource = """
            tell application "Safari"
                activate
            end tell
            """
            if let script = NSAppleScript(source: scriptSource) {
                script.executeAndReturnError(nil)
            }
        }
    }

}
