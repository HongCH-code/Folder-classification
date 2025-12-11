// 全局變數
let sourceFolderHandle = null;
let photoFiles = [];
let processedCount = 0;
let totalCount = 0;

// DOM 元素
const selectFolderBtn = document.getElementById('selectFolderBtn');
const copyModeCheckbox = document.getElementById('copyMode');
const createSubfolderCheckbox = document.getElementById('createSubfolder');
const progressSection = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logSection = document.getElementById('logSection');
const logContent = document.getElementById('logContent');
const resultSection = document.getElementById('result');
const resultContent = document.getElementById('resultContent');

// 支援的圖片格式
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif'];

// 事件監聽器
selectFolderBtn.addEventListener('click', selectAndProcessFolder);

// 檢查瀏覽器支援
function checkBrowserSupport() {
    if (!('showDirectoryPicker' in window)) {
        alert('您的瀏覽器不支援 File System Access API。請使用 Chrome 86+ 或 Edge 86+ 瀏覽器。');
        return false;
    }
    return true;
}

// 添加日誌
function addLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

// 更新進度
function updateProgress(current, total) {
    const percentage = Math.round((current / total) * 100);
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${current} / ${total} (${percentage}%)`;
}

// 選擇資料夾並處理
async function selectAndProcessFolder() {
    if (!checkBrowserSupport()) return;

    try {
        // 重置狀態
        resetUI();

        // 選擇資料夾
        addLog('請選擇包含照片的資料夾...', 'info');
        sourceFolderHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });

        addLog(`已選擇資料夾: ${sourceFolderHandle.name}`, 'success');
        selectFolderBtn.disabled = true;

        // 顯示進度區域
        progressSection.style.display = 'block';
        logSection.style.display = 'block';

        // 掃描照片文件
        await scanPhotoFiles();

        if (photoFiles.length === 0) {
            addLog('未找到任何照片文件！', 'error');
            selectFolderBtn.disabled = false;
            return;
        }

        addLog(`找到 ${photoFiles.length} 個照片文件`, 'success');

        // 處理照片分類
        await classifyAndOrganizePhotos();

    } catch (error) {
        if (error.name === 'AbortError') {
            addLog('已取消選擇資料夾', 'info');
        } else {
            addLog(`錯誤: ${error.message}`, 'error');
            console.error(error);
        }
        selectFolderBtn.disabled = false;
    }
}

// 重置 UI
function resetUI() {
    photoFiles = [];
    processedCount = 0;
    totalCount = 0;
    logContent.innerHTML = '';
    resultSection.style.display = 'none';
    progressSection.style.display = 'none';
    logSection.style.display = 'none';
    updateProgress(0, 100);
}

// 掃描照片文件
async function scanPhotoFiles() {
    addLog('正在掃描照片文件...', 'info');
    photoFiles = [];

    for await (const entry of sourceFolderHandle.values()) {
        if (entry.kind === 'file') {
            const fileName = entry.name.toLowerCase();
            const isPhoto = SUPPORTED_FORMATS.some(format => fileName.endsWith(format));

            if (isPhoto) {
                photoFiles.push(entry);
            }
        }
    }
}

// 從文件中提取 EXIF 日期
async function getPhotoDate(fileHandle) {
    try {
        const file = await fileHandle.getFile();

        // 嘗試從 EXIF 獲取日期
        const exifDate = await extractExifDate(file);
        if (exifDate) {
            return exifDate;
        }

        // 如果沒有 EXIF，使用文件修改日期
        return new Date(file.lastModified);

    } catch (error) {
        console.error(`無法讀取文件日期: ${fileHandle.name}`, error);
        return new Date();
    }
}

// 提取 EXIF 日期
function extractExifDate(file) {
    return new Promise((resolve) => {
        EXIF.getData(file, function() {
            const dateTime = EXIF.getTag(this, 'DateTime') ||
                           EXIF.getTag(this, 'DateTimeOriginal') ||
                           EXIF.getTag(this, 'DateTimeDigitized');

            if (dateTime) {
                // EXIF 日期格式: "YYYY:MM:DD HH:MM:SS"
                const parts = dateTime.split(' ')[0].split(':');
                if (parts.length === 3) {
                    const date = new Date(parts[0], parts[1] - 1, parts[2]);
                    resolve(date);
                    return;
                }
            }
            resolve(null);
        });
    });
}

// 格式化日期為資料夾名稱
function formatDateForFolder(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 分類並整理照片
async function classifyAndOrganizePhotos() {
    addLog('開始分類照片...', 'info');

    const copyMode = copyModeCheckbox.checked;
    const createSubfolder = createSubfolderCheckbox.checked;

    // 按日期分組
    const photosByDate = new Map();
    totalCount = photoFiles.length;
    processedCount = 0;

    // 第一步：讀取所有照片的日期並分組
    addLog('正在讀取照片日期資訊...', 'info');
    for (const fileHandle of photoFiles) {
        const date = await getPhotoDate(fileHandle);
        const dateKey = formatDateForFolder(date);

        if (!photosByDate.has(dateKey)) {
            photosByDate.set(dateKey, []);
        }
        photosByDate.get(dateKey).push(fileHandle);

        processedCount++;
        updateProgress(processedCount, totalCount * 2); // 總共兩個階段
    }

    addLog(`已分類為 ${photosByDate.size} 個日期`, 'success');

    // 第二步：創建資料夾並複製/移動文件
    const actionText = copyMode ? '複製' : '移動';
    addLog(`正在${actionText}照片到資料夾...`, 'info');

    const targetFolderHandle = createSubfolder ? sourceFolderHandle : sourceFolderHandle;
    let successCount = 0;
    let errorCount = 0;

    for (const [dateKey, files] of photosByDate) {
        try {
            // 創建日期資料夾
            const dateFolderHandle = await targetFolderHandle.getDirectoryHandle(dateKey, { create: true });
            addLog(`創建資料夾: ${dateKey}`, 'info');

            // 複製/移動文件到日期資料夾
            for (const fileHandle of files) {
                try {
                    const file = await fileHandle.getFile();
                    const newFileHandle = await dateFolderHandle.getFileHandle(file.name, { create: true });
                    const writable = await newFileHandle.createWritable();
                    await writable.write(file);
                    await writable.close();

                    // 如果是移動模式，刪除原始文件
                    if (!copyMode) {
                        try {
                            await sourceFolderHandle.removeEntry(fileHandle.name);
                            addLog(`已移動: ${fileHandle.name}`, 'success');
                        } catch (removeError) {
                            addLog(`警告: 文件已複製但無法刪除原文件 ${fileHandle.name}`, 'error');
                        }
                    }

                    successCount++;
                    processedCount++;
                    updateProgress(processedCount, totalCount * 2);

                } catch (error) {
                    addLog(`${actionText}失敗: ${fileHandle.name} - ${error.message}`, 'error');
                    errorCount++;
                }
            }

        } catch (error) {
            addLog(`創建資料夾失敗: ${dateKey} - ${error.message}`, 'error');
            errorCount += files.length;
        }
    }

    // 顯示結果
    showResult(photosByDate.size, successCount, errorCount);
    selectFolderBtn.disabled = false;
}

// 顯示結果
function showResult(folderCount, successCount, errorCount) {
    resultSection.style.display = 'block';

    const mode = copyModeCheckbox.checked ? '複製' : '移動';

    resultContent.innerHTML = `
        <p><strong>處理完成！</strong></p>
        <p>📁 創建了 <strong>${folderCount}</strong> 個日期資料夾</p>
        <p>✅ 成功${mode}了 <strong>${successCount}</strong> 個照片</p>
        ${errorCount > 0 ? `<p>❌ 失敗 <strong>${errorCount}</strong> 個照片</p>` : ''}
        <p style="margin-top: 20px; color: #666;">請檢查資料夾以確認分類結果。</p>
    `;

    addLog(`處理完成！成功: ${successCount}, 失敗: ${errorCount}`, 'success');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    addLog('照片分類工具已就緒', 'success');
    checkBrowserSupport();
});
