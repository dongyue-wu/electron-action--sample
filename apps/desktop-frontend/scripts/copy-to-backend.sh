#!/bin/sh

# 目标目录
TARGET_DIR="../desktop-backend/frontend/out"
PARENT_DIR="../desktop-backend/frontend"

# 检查父目录是否存在，如果不存在则创建
if [ ! -d "$PARENT_DIR" ]; then
    echo "Creating directory: $PARENT_DIR..."
    mkdir -p "$PARENT_DIR"
fi

# 检查目标目录是否存在，如果存在则删除
if [ -d "$TARGET_DIR" ]; then
    echo "Removing existing out directory in desktop-backend..."
    rm -rf "$TARGET_DIR"
fi

# 复制当前项目的 out 目录到目标目录
echo "Copying out directory to desktop-backend..."
cp -r out "$TARGET_DIR"

echo "Copy completed successfully!"