import { execSync } from 'child_process';
import { existsSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const xcodeproj = join(__dirname, 'Xcode/YouTubeAmbilight.xcodeproj');
  const buildSettings = execSync(`xcodebuild -project "${xcodeproj}" -scheme YouTubeAmbilight -configuration Debug -showBuildSettings`, { encoding: 'utf8', cwd: __dirname });
  const match = buildSettings.match(/TARGET_BUILD_DIR = (.*)/);
  if (!match || !match[1]) {
    console.error('Could not find TARGET_BUILD_DIR');
    process.exit(1);
  }
  const sourceApp = join(match[1].trim(), 'YouTubeAmbilight.app');
  if (!existsSync(sourceApp)) {
    console.error(`Source app does not exist at ${sourceApp}`);
    process.exit(1);
  }

  const destApp = '/Applications/YouTubeAmbilight.app';
  if (existsSync(destApp)) {
    rmSync(destApp, { recursive: true, force: true });
  }
  cpSync(sourceApp, destApp, { recursive: true });
  console.log(`Copied ${sourceApp} -> ${destApp}`);

  // Clean any temporary preview artifacts if any
  execSync(`find "${destApp}" -name "*__preview.dylib" -delete 2>/dev/null || true`);

  // Sign with local Apple Development certificate if available, else ad-hoc
  try {
    const idOutput = execSync('security find-identity -p codesigning -v', { encoding: 'utf8' });
    const idMatch = idOutput.match(/"(Apple Development: [^"]+)"/);
    const identity = (idMatch && idMatch[1]) ? idMatch[1] : '-';
    console.log(`Signing with identity: ${identity}`);

    const extAppex = join(destApp, 'Contents/PlugIns/YouTubeAmbilight Extension.appex');
    const extEntitlements = join(__dirname, 'Xcode/YouTubeAmbilight Extension/YouTubeAmbilight Extension.entitlements');
    const appEntitlements = join(__dirname, 'Xcode/YouTubeAmbilight/YouTubeAmbilight.entitlements');

    if (existsSync(extAppex)) {
      execSync(`codesign --force --options runtime --sign "${identity}" --timestamp=none --entitlements "${extEntitlements}" "${extAppex}"`);
    }
    execSync(`codesign --force --options runtime --sign "${identity}" --timestamp=none --entitlements "${appEntitlements}" "${destApp}"`);
    console.log(`Successfully signed ${destApp} and its extension`);
  } catch (signErr) {
    console.warn('Code signing failed:', signErr.message);
  }

  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister';
  if (existsSync(lsregister)) {
    execSync(`"${lsregister}" -f -R -trusted "${destApp}"`);
    console.log(`Registered ${destApp} with LaunchServices`);
  }
} catch (err) {
  console.error('Failed to install Safari app:', err);
}
