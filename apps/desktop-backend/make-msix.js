const { execSyncWithBuildTools } = require("./buildtools-utils");
const fs = require("fs");
const path = require("path");

// 解析命令行参数
const args = process.argv.slice(2);
const SIGN_MODE = getSignMode(args);
const CERT_PATH = getArgValue(args, '--cert-path');
const CERT_PASSWORD = getArgValue(args, '--cert-password');

function getSignMode(args) {
  if (args.includes('--no-sign')) return 'none';
  if (args.includes('--prod-sign') && CERT_PATH) return 'production';
  return 'self-signed'; // 默认使用自签名
}

function getArgValue(args, argName) {
  const index = args.indexOf(argName);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

/**
 * MSIX Package Builder
 * 
 * This script creates an MSIX package using the Windows SDK BuildTools.
 * It performs the following steps:
 * 1. Creates dist/win-unpacked directory structure
 * 2. Copies appxmanifest-full.xml to the package folder as appxmanifest.xml
 * 3. Copies assets folder to the package folder
 * 4. Cleans up any existing config/pri files
 * 5. Runs makepri createconfig to create a PRI configuration file
 * 6. Runs makepri new to generate a new PRI file
 * 7. Runs makeappx pack to create the final MSIX package
 * 8. Signs the MSIX package (optional)
 * 9. Cleans up temporary files
 * 
 * Usage:
 * node make-msix.js [options]
 * 
 * Options:
 * --no-sign              Skip signing the MSIX package
 * --prod-sign            Use production certificate for signing
 * --cert-path <path>     Path to the production certificate (.pfx file)
 * --cert-password <pwd>  Password for the production certificate
 * --prepare-only, -p     Only prepare files, don't build
 * --build-only, -b       Only build package, skip preparation
 */

const DIST_DIR = path.join(__dirname, "dist"); // 中间产物目录
const OUT_DIR = path.join(__dirname, "out"); // 最终产物目录
const PACKAGE_DIR = path.join(DIST_DIR, "msix-package"); // 专用的MSIX包目录
const ELECTRON_DIST_DIR = path.join(DIST_DIR, "win-unpacked"); // electron-builder 输出目录
const MSIX_SOURCE_DIR = path.join(__dirname, "msix");
const ASSETS_SOURCE_DIR = path.join(MSIX_SOURCE_DIR, "assets");
const ASSETS_DEST_DIR = path.join(PACKAGE_DIR, "assets");

async function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

async function copyFile(source, destination) {
  try {
    fs.copyFileSync(source, destination);
    console.log(`Copied: ${source} -> ${destination}`);
  } catch (error) {
    throw new Error(`Failed to copy file ${source} to ${destination}: ${error.message}`);
  }
}

async function copyDirectory(source, destination) {
  try {
    // Ensure destination directory exists
    await ensureDirectoryExists(destination);
    
    // Read all files in source directory
    const files = fs.readdirSync(source);
    
    for (const file of files) {
      const sourcePath = path.join(source, file);
      const destPath = path.join(destination, file);
      
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        // Recursively copy subdirectories
        await copyDirectory(sourcePath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(sourcePath, destPath);
      }
    }
    
    console.log(`Copied directory: ${source} -> ${destination}`);
  } catch (error) {
    throw new Error(`Failed to copy directory ${source} to ${destination}: ${error.message}`);
  }
}

async function deleteFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${filePath}`);
    }
  } catch (error) {
    console.warn(`Warning: Could not delete ${filePath}: ${error.message}`);
  }
}

async function cleanupTempFiles() {
  console.log("Cleaning up temporary files...");
  
  // Clean up PRI config and resource files
  const tempFiles = [
    path.join(PACKAGE_DIR, "priconfig.xml"),
    path.join(PACKAGE_DIR, "resources.pri"),
    path.join(PACKAGE_DIR, "resources.pri.backup")
  ];
  
  for (const file of tempFiles) {
    await deleteFileIfExists(file);
  }
}

async function createPriConfig() {
  console.log("Creating PRI configuration file...");
  
  const configPath = path.join(PACKAGE_DIR, "priconfig.xml");
  const command = `makepri createconfig /cf "${configPath}" /dq en-US /pv 10.0.0`;
  
  try {
    await execSyncWithBuildTools(command, { stdio: 'inherit' });
    console.log("PRI configuration created successfully");
  } catch (error) {
    throw new Error(`Failed to create PRI configuration: ${error.message}`);
  }
}

async function generatePriFile() {
  console.log("Generating PRI file...");
  
  const configPath = path.join(PACKAGE_DIR, "priconfig.xml");
  const command = `makepri new /pr "${PACKAGE_DIR}" /cf "${configPath}" /of "${path.join(PACKAGE_DIR, "resources.pri")}"`;
  
  try {
    await execSyncWithBuildTools(command, { stdio: 'inherit' });
    console.log("PRI file generated successfully");
  } catch (error) {
    throw new Error(`Failed to generate PRI file: ${error.message}`);
  }
}

async function createMsixPackage() {
  console.log("Creating MSIX package...");
  
  // 确保输出目录存在
  await ensureDirectoryExists(OUT_DIR);
  
  const outputPath = path.join(OUT_DIR, "Manus.msix");
  const command = `makeappx pack /o /d "${PACKAGE_DIR}" /nv /p "${outputPath}"`;
  
  try {
    await execSyncWithBuildTools(command, { stdio: 'inherit' });
    console.log(`MSIX package created successfully: ${outputPath}`);
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to create MSIX package: ${error.message}`);
  }
}

/**
 * 创建自签名证书用于代码签名
 */
async function createSelfSignedCertificate() {
  console.log("Creating self-signed certificate...");
  
  const certName = "845AA9DF-1559-4AA0-8A94-CE74FEB6A77B";
  const certPath = path.join(MSIX_SOURCE_DIR, "Manus.pfx");
  const certPassword = "password123"; // 在实际生产中应该使用更安全的密码
  
  // 检查证书是否已存在
  if (fs.existsSync(certPath)) {
    console.log(`Certificate already exists: ${certPath}`);
    return { certPath, certPassword };
  }
  
  try {
    // 创建自签名证书
    // 注意：这个证书的 Subject 必须匹配 manifest 中的 Publisher
    const createCertCommand = `powershell -Command "` +
      `$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=${certName}' ` +
      `-KeyUsage DigitalSignature -FriendlyName 'Manus MSIX Signing Certificate' ` +
      `-CertStoreLocation 'Cert:\\CurrentUser\\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}'); ` +
      `$password = ConvertTo-SecureString -String '${certPassword}' -Force -AsPlainText; ` +
      `Export-PfxCertificate -Cert $cert -FilePath '${certPath}' -Password $password"`;
    
    await execSyncWithBuildTools(createCertCommand, { stdio: 'inherit' });
    
    console.log(`Self-signed certificate created: ${certPath}`);
    console.log(`Certificate password: ${certPassword}`);
    
    return { certPath, certPassword };
  } catch (error) {
    throw new Error(`Failed to create self-signed certificate: ${error.message}`);
  }
}

/**
 * 将证书安装到信任的根证书存储区
 */
async function installCertificateToTrustedRoot(certPath) {
  console.log("Installing certificate to Trusted Root Certification Authorities...");
  
  try {
    // 从 PFX 中提取公钥证书并安装到受信任的根证书存储区
    const installCommand = `powershell -Command "` +
      `$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${certPath}', 'password123'); ` +
      `$store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser); ` +
      `$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); ` +
      `$store.Add($cert); ` +
      `$store.Close(); ` +
      `Write-Host 'Certificate installed to Trusted Root'"`;
    
    await execSyncWithBuildTools(installCommand, { stdio: 'inherit' });
    console.log("Certificate installed to Trusted Root successfully");
  } catch (error) {
    console.warn(`Failed to install certificate to trusted root: ${error.message}`);
    console.log("You may need to install the certificate manually or run as administrator");
  }
}

/**
 * 签名 MSIX 包
 */
async function signMsixPackage(msixPath, certPath, certPassword) {
  console.log("Signing MSIX package...");
  
  try {
    // 使用 SignTool 签名
    const signCommand = `signtool sign /fd SHA256 /a /f "${certPath}" /p "${certPassword}" "${msixPath}"`;
    
    await execSyncWithBuildTools(signCommand, { stdio: 'inherit' });
    console.log("MSIX package signed successfully");
  } catch (error) {
    throw new Error(`Failed to sign MSIX package: ${error.message}`);
  }
}

/**
 * 验证 MSIX 包签名
 */
async function verifyMsixSignature(msixPath) {
  console.log("Verifying MSIX package signature...");
  
  try {
    const verifyCommand = `signtool verify /pa "${msixPath}"`;
    
    await execSyncWithBuildTools(verifyCommand, { stdio: 'inherit' });
    console.log("MSIX package signature verified successfully");
  } catch (error) {
    console.warn(`Signature verification failed: ${error.message}`);
    console.log("This is expected if using a self-signed certificate");
  }
}

async function checkElectronApp() {
  console.log("Checking for Electron application...");
  
  // Check if the electron app exists in the expected location
  const electronAppPath = path.join(PACKAGE_DIR, "Manus.exe");
  
  if (!fs.existsSync(electronAppPath)) {
    console.warn(`Warning: Electron app not found at ${electronAppPath}`);
    console.log("Please ensure you have built the Electron application first using:");
    console.log("  npm run build:dev");
    
    // Look for any .exe files in the package directory
    const files = fs.readdirSync(PACKAGE_DIR);
    const exeFiles = files.filter(file => file.endsWith('.exe'));
    
    if (exeFiles.length > 0) {
      console.log("Found executable files:");
      exeFiles.forEach(file => console.log(`  - ${file}`));
      console.log("You may need to update the manifest Executable property accordingly.");
    }
  } else {
    console.log(`✓ Found Electron app: ${electronAppPath}`);
  }
}

async function copyElectronApp() {
  console.log("Copying Electron application files...");
  
  // Look for electron-builder output
  const electronBuilderDirs = [
    path.join(DIST_DIR, "win-unpacked"),  // Standard electron-builder output in dist
    path.join(OUT_DIR, "win-unpacked"),   // Alternative output in out directory
    path.join(__dirname, "out", "win-unpacked"), // Legacy path
    path.join(__dirname, "out", "Manus-win32-x64"), // Possible alternative format
  ];
  
  let electronAppSource = null;
  
  // Find the electron app directory
  for (const dir of electronBuilderDirs) {
    if (fs.existsSync(dir)) {
      electronAppSource = dir;
      console.log(`Found Electron app directory: ${dir}`);
      break;
    }
  }
  
  if (!electronAppSource) {
    console.warn("Warning: Electron app directory not found!");
    console.log("Please ensure you have built the Electron application first using:");
    console.log("  npm run dist:unpack");
    return;
  }
  
  // Copy all files from electron app directory to package directory
  // But exclude files that will be overwritten by MSIX-specific files
  const filesToExclude = ['appxmanifest.xml', 'assets', 'registration.json'];
  
  const files = fs.readdirSync(electronAppSource);
  
  for (const file of files) {
    if (filesToExclude.includes(file)) {
      console.log(`Skipping ${file} (will be overwritten by MSIX-specific version)`);
      continue;
    }
    
    const sourcePath = path.join(electronAppSource, file);
    const destPath = path.join(PACKAGE_DIR, file);
    
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      await copyDirectory(sourcePath, destPath);
    } else {
      await copyFile(sourcePath, destPath);
    }
  }
  
  console.log("Electron application files copied successfully!");
}

async function preparePackage() {
  console.log("=== STEP 1: PREPARING PACKAGE ===");
  
  try {
    // Step 1.1: Ensure directories exist
    console.log("Setting up directory structure...");
    await ensureDirectoryExists(DIST_DIR);
    await ensureDirectoryExists(PACKAGE_DIR);
    
    // Step 1.2: Clean up any existing files first
    console.log("Cleaning up existing files...");
    await cleanupTempFiles();
    
    // Step 1.3: Copy Electron application files
    await copyElectronApp();
    
    // Step 1.4: Copy appxmanifest-full.xml as appxmanifest.xml
    console.log("Copying manifest file...");
    const manifestSource = path.join(MSIX_SOURCE_DIR, "appxmanifest-full.xml");
    const manifestDest = path.join(PACKAGE_DIR, "appxmanifest.xml");
    
    if (!fs.existsSync(manifestSource)) {
      throw new Error(`Manifest file not found: ${manifestSource}`);
    }
    
    await copyFile(manifestSource, manifestDest);
    
    // Step 1.5: Copy assets folder
    console.log("Copying assets...");
    if (!fs.existsSync(ASSETS_SOURCE_DIR)) {
      throw new Error(`Assets folder not found: ${ASSETS_SOURCE_DIR}`);
    }
    
    await copyDirectory(ASSETS_SOURCE_DIR, ASSETS_DEST_DIR);

    // Step 1.6: Copy the registration.json file
    console.log("Copying registration.json...");
    const registrationSource = path.join(MSIX_SOURCE_DIR, "registration.json");
    const registrationDest = path.join(PACKAGE_DIR, "registration.json");

    if (!fs.existsSync(registrationSource)) {
      throw new Error(`Registration file not found: ${registrationSource}`);
    }

    await copyFile(registrationSource, registrationDest);

    // Step 1.7: Check for Electron application
    await checkElectronApp();

    console.log("Package preparation completed successfully!");
    
  } catch (error) {
    console.error("Error preparing package:", error.message);
    throw error;
  }
}

async function buildPackage() {
  console.log("=== STEP 2: BUILDING MSIX PACKAGE ===");
  
  try {
    // Step 2.1: Create PRI configuration
    await createPriConfig();
    
    // Step 2.2: Generate PRI file
    await generatePriFile();
    
    // Step 2.3: Create MSIX package
    const msixPath = await createMsixPackage();
    
    // Step 2.4: Sign MSIX package
    console.log("\n=== STEP 3: SIGNING MSIX PACKAGE ===");
    if (SIGN_MODE === 'production' && CERT_PATH && CERT_PASSWORD) {
      await installCertificateToTrustedRoot(CERT_PATH);
      await signMsixPackage(msixPath, CERT_PATH, CERT_PASSWORD);
      await verifyMsixSignature(msixPath);
    } else if (SIGN_MODE === 'self-signed') {
      const { certPath, certPassword } = await createSelfSignedCertificate();
      await installCertificateToTrustedRoot(certPath);
      await signMsixPackage(msixPath, certPath, certPassword);
      await verifyMsixSignature(msixPath);
    } else {
      console.log("Skipping signing as --no-sign or --prod-sign was specified.");
    }
    
    // Step 2.5: Clean up temporary files
    await cleanupTempFiles();
    
    console.log("MSIX package build completed successfully!");
    
  } catch (error) {
    console.error("Error building package:", error.message);
    throw error;
  }
}

async function main() {
  console.log("Starting MSIX package creation...");
  
  try {
    // Step 1: Prepare the package (clean up and copy files)
    await preparePackage();
    
    console.log("\n" + "=".repeat(50));
    console.log("Preparation complete! Ready for packaging...");
    console.log("=".repeat(50) + "\n");
    
    // Step 2: Build the package (run packaging commands)
    await buildPackage();
    
    console.log("\n" + "=".repeat(50));
    console.log("MSIX package creation completed successfully!");
    console.log(`Output: ${path.join(OUT_DIR, "Manus.msix")}`);
    console.log("=".repeat(50));
    
  } catch (error) {
    console.error("Error creating MSIX package:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  // Check if specific step is requested
  const args = process.argv.slice(2);
  
  if (args.includes('--prepare-only') || args.includes('-p')) {
    console.log("Running preparation step only...");
    preparePackage().catch(error => {
      console.error("Preparation failed:", error.message);
      process.exit(1);
    });
  } else if (args.includes('--build-only') || args.includes('-b')) {
    console.log("Running build step only...");
    buildPackage().catch(error => {
      console.error("Build failed:", error.message);
      process.exit(1);
    });
  } else {
    // Run both steps
    main();
  }
}

module.exports = { main, preparePackage, buildPackage };