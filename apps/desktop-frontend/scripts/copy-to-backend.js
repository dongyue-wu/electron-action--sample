#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// 目标目录
const TARGET_DIR = path.join('..', 'desktop-backend', 'frontend', 'out')
const PARENT_DIR = path.join('..', 'desktop-backend', 'frontend')

console.log('开始复制前端文件到后端目录...')

// 确保父目录存在
if (!fs.existsSync(PARENT_DIR)) {
  console.log(`创建目录: ${PARENT_DIR}...`)
  fs.mkdirSync(PARENT_DIR, { recursive: true })
}

// 如果目标目录存在，则删除
if (fs.existsSync(TARGET_DIR)) {
  console.log('删除现有的 out 目录...')
  fs.rmSync(TARGET_DIR, { recursive: true, force: true })
}

// 复制 out 目录到目标目录
console.log('复制 out 目录到 desktop-backend...')
copyDirectory('out', TARGET_DIR)

console.log('复制完成！')

/**
 * 递归复制目录
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 */
function copyDirectory(src, dest) {
  // 创建目标目录
  fs.mkdirSync(dest, { recursive: true })

  // 读取源目录中的所有文件和子目录
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      // 递归复制子目录
      copyDirectory(srcPath, destPath)
    } else {
      // 复制文件
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
