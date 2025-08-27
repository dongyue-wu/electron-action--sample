const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const { spawn } = require("child_process");

const PACKAGE_NAME = 'Microsoft.Windows.SDK.BuildTools';
const NUGET_API_BASE = 'https://api.nuget.org/v3-flatcontainer';

async function getNuGetPackageVersions(packageName) {
  return new Promise((resolve, reject) => {
    const url = `${NUGET_API_BASE}/${packageName.toLowerCase()}/index.json`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.versions);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function compareVersions(a, b) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || 0;
    const bPart = bParts[i] || 0;
    
    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }
  
  return 0;
}

function getLatestVersion(versions) {
  // Filter out prerelease versions (those containing '-')
  const stableVersions = versions.filter(v => !v.includes('-'));
  
  if (stableVersions.length === 0) {
    // If no stable versions, use all versions
    return versions.sort(compareVersions).pop();
  }
  
  return stableVersions.sort(compareVersions).pop();
}

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (error) => {
          fs.unlink(outputPath, () => {}); // Delete the file on error
          reject(error);
        });
      } else {
        file.close();
        fs.unlink(outputPath, () => {}); // Delete the file on error
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', (error) => {
      file.close();
      fs.unlink(outputPath, () => {}); // Delete the file on error
      reject(error);
    });
  });
}

function extractZip(zipPath, extractPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create extract directory
      if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
      }

      // NuGet packages are ZIP files, but PowerShell doesn't recognize .nupkg extension
      // So we'll rename it to .zip temporarily
      const tempZipPath = zipPath.replace('.nupkg', '.zip');
      fs.copyFileSync(zipPath, tempZipPath);

      // Use PowerShell to extract the ZIP file on Windows
      const powershellCommand = `Expand-Archive -Path "${tempZipPath}" -DestinationPath "${extractPath}" -Force`;
      
      const powershell = spawn('powershell.exe', ['-NoProfile', '-Command', powershellCommand], {
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      powershell.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      powershell.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      powershell.on('close', (code) => {
        // Clean up the temporary zip file
        try {
          fs.unlinkSync(tempZipPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PowerShell extraction failed with code ${code}: ${errorOutput}`));
        }
      });
      
      powershell.on('error', (error) => {
        // Clean up the temporary zip file
        try {
          fs.unlinkSync(tempZipPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        reject(error);
      });
      
    } catch (error) {
      reject(error);
    }
  });
}

async function downloadAndExtractBuildTools() {
  try {
    console.log(`Fetching versions for ${PACKAGE_NAME}...`);
    const versions = await getNuGetPackageVersions(PACKAGE_NAME);
    
    if (!versions || versions.length === 0) {
      throw new Error('No versions found for the package');
    }
    
    const latestVersion = getLatestVersion(versions);
    console.log(`Latest version: ${latestVersion}`);
    
    // Create output paths - extract to buildtools folder
    const packageFileName = `${PACKAGE_NAME}.${latestVersion}.nupkg`;
    const buildtoolsDir = path.join(__dirname);
    const packagePath = path.join(buildtoolsDir, packageFileName);
    const extractPath = path.join(buildtoolsDir, PACKAGE_NAME);
    
    // Create download URL
    const downloadUrl = `${NUGET_API_BASE}/${PACKAGE_NAME.toLowerCase()}/${latestVersion}/${PACKAGE_NAME.toLowerCase()}.${latestVersion}.nupkg`;
    
    console.log(`Downloading from: ${downloadUrl}`);
    console.log(`Saving to: ${packagePath}`);
    
    await downloadFile(downloadUrl, packagePath);
    
    console.log('Download completed!');
    console.log(`Extracting to: ${extractPath}`);
    
    await extractZip(packagePath, extractPath);
    
    // Clean up the downloaded .nupkg file after successful extraction
    try {
      fs.unlinkSync(packagePath);
      console.log('Downloaded package file cleaned up.');
    } catch (cleanupError) {
      console.warn('Warning: Could not delete downloaded package file:', cleanupError.message);
    }
    
    console.log('BuildTools extraction completed!');
    console.log(`BuildTools available at: ${extractPath}`);
    
  } catch (error) {
    console.error('Error downloading BuildTools:', error.message);
    throw error;
  }
}

function getCurrentArchitecture() {
  const arch = os.arch();
  
  // Map Node.js architecture names to BuildTools folder names
  switch (arch) {
    case 'x64':
      return 'x64';
    case 'ia32':
    case 'x32':
      return 'x86';
    case 'arm64':
      return 'arm64';
    case 'arm':
      return 'arm64'; // Use arm64 as fallback for arm
    default:
      // Fallback order: prefer x64, then x86, then arm64
      return ['x64', 'x86', 'arm64'];
  }
}

async function findBuildToolsBinPath() {
  // Look for the BuildTools folder in the buildtools directory
  const buildtoolsDir = path.join(__dirname);
  const buildToolsFolder = path.join(buildtoolsDir, PACKAGE_NAME);
  let buildToolsPath = null;
  
  // Check if BuildTools folder exists in buildtools directory
  if (fs.existsSync(buildToolsFolder)) {
    buildToolsPath = buildToolsFolder;
  }
  
  // If not found, download and extract BuildTools
  if (!buildToolsPath) {
    console.log(`${PACKAGE_NAME} not found in buildtools folder. Downloading...`);
    await downloadAndExtractBuildTools();
    
    // Try to find it again after download
    if (fs.existsSync(buildToolsFolder)) {
      buildToolsPath = buildToolsFolder;
    } else {
      throw new Error(`Could not find ${PACKAGE_NAME} folder even after download`);
    }
  }
  
  const binPath = path.join(buildToolsPath, "bin");
  if (!fs.existsSync(binPath)) {
    throw new Error(`Could not find bin folder in ${buildToolsPath}`);
  }
  
  // Find the version folder (should be something like 10.0.26100.0)
  const versionFolders = fs.readdirSync(binPath)
    .filter(item => fs.statSync(path.join(binPath, item)).isDirectory())
    .filter(item => /^\d+\.\d+\.\d+\.\d+$/.test(item));
  
  if (versionFolders.length === 0) {
    throw new Error(`Could not find version folder in ${binPath}`);
  }
  
  // Use the latest version (sort by version number)
  const latestVersion = versionFolders.sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      if (aParts[i] !== bParts[i]) {
        return bParts[i] - aParts[i]; // Descending order
      }
    }
    return 0;
  })[0];
  
  const versionPath = path.join(binPath, latestVersion);
  
  // Determine architecture based on current machine
  const currentArch = getCurrentArchitecture();
  let archPath = null;
  
  if (Array.isArray(currentArch)) {
    // Fallback order for unknown architectures
    for (const arch of currentArch) {
      const candidateArchPath = path.join(versionPath, arch);
      if (fs.existsSync(candidateArchPath)) {
        archPath = candidateArchPath;
        break;
      }
    }
  } else {
    // Use the detected architecture
    const candidateArchPath = path.join(versionPath, currentArch);
    if (fs.existsSync(candidateArchPath)) {
      archPath = candidateArchPath;
    } else {
      // If the detected architecture isn't available, fall back to common architectures
      const fallbackArchs = ['x64', 'x86', 'arm64'];
      for (const arch of fallbackArchs) {
        if (arch !== currentArch) { // Skip the one we already tried
          const fallbackArchPath = path.join(versionPath, arch);
          if (fs.existsSync(fallbackArchPath)) {
            archPath = fallbackArchPath;
            console.warn(`Warning: Using ${arch} build tools instead of preferred ${currentArch}`);
            break;
          }
        }
      }
    }
  }
  
  if (!archPath) {
    throw new Error(`Could not find architecture folder in ${versionPath}`);
  }
  
  return archPath;
}

/**
 * Execute a command with BuildTools bin path added to PATH environment
 * @param {string} command - The command to execute
 * @param {object} options - Options to pass to execSync (optional)
 * @returns {Buffer} - The output from execSync
 */
async function execSyncWithBuildTools(command, options = {}) {
  const buildToolsBinPath = await findBuildToolsBinPath();
  
  // Get current PATH and prepend the BuildTools bin path
  const currentPath = process.env.PATH || '';
  const newPath = `${buildToolsBinPath}${path.delimiter}${currentPath}`;
  
  // Merge the new PATH with existing environment variables
  const env = {
    ...process.env,
    ...options.env,
    PATH: newPath
  };
  
  // Execute the command with the updated environment
  return execSync(command, {
    ...options,
    env
  });
}

/**
 * Get the full path to a specific BuildTools executable
 * @param {string} toolName - Name of the tool (e.g., 'mt.exe', 'signtool.exe')
 * @returns {string} - Full path to the executable
 */
async function getBuildToolPath(toolName) {
  const binPath = await findBuildToolsBinPath();
  const toolPath = path.join(binPath, toolName);
  
  if (!fs.existsSync(toolPath)) {
    throw new Error(`Could not find ${toolName} in ${binPath}`);
  }
  
  return toolPath;
}

/**
 * Ensure BuildTools are available and return the bin path
 * @returns {string} - Path to the BuildTools bin directory
 */
async function ensureBuildTools() {
  return await findBuildToolsBinPath();
}

module.exports = {
  execSyncWithBuildTools,
  getBuildToolPath,
  findBuildToolsBinPath,
  getCurrentArchitecture,
  ensureBuildTools,
  downloadAndExtractBuildTools
};
