import { Album, CSV_HEADERS } from '../types';

/**
 * 解析CSV文件
 */
export function parseCSV(file: File): Promise<Album[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          reject(new Error('CSV文件至少需要包含表头和数据行'));
          return;
        }
        
        // 解析表头
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);
        
        // 校验表头
        const missingHeaders: string[] = [];
        CSV_HEADERS.forEach(expectedHeader => {
          if (!headers.includes(expectedHeader)) {
            missingHeaders.push(expectedHeader);
          }
        });
        
        if (missingHeaders.length > 0) {
          reject(new Error(`缺少必需字段：${missingHeaders.join('、')}`));
          return;
        }
        
        // 解析数据行
        const albums: Album[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          
          if (values.length !== headers.length) {
            reject(new Error(`第${i + 1}行数据列数不匹配，期望${headers.length}列，实际${values.length}列`));
            return;
          }
          
          const album: Album = {
            albumId: values[headers.indexOf('专辑id')]?.trim() || '',
            albumName: values[headers.indexOf('专辑名称')]?.trim() || '',
            bookName: values[headers.indexOf('书名')]?.trim() || '',
            category: values[headers.indexOf('赛道品类')]?.trim() || '',
            image1: values[headers.indexOf('图片1链接')]?.trim() || '',
            image2: values[headers.indexOf('图片2链接')]?.trim() || '',
            image3: values[headers.indexOf('图片3链接')]?.trim() || '',
            image4: values[headers.indexOf('图片4链接')]?.trim() || '',
          };
          
          // 校验必需字段
          if (!album.albumId) {
            reject(new Error(`第${i + 1}行：专辑id不能为空`));
            return;
          }
          
          albums.push(album);
        }
        
        resolve(albums);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('CSV解析失败'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };
    
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * 解析CSV行（处理引号和逗号）
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 转义的双引号
        current += '"';
        i++;
      } else {
        // 切换引号状态
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 字段分隔符
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // 添加最后一个字段
  values.push(current);
  
  return values;
}

/**
 * 导出CSV文件
 */
export function exportCSV(data: Array<Record<string, string>>, filename: string) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }
  
  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];
  
  // 添加表头
  csvRows.push(headers.map(h => escapeCSVField(h)).join(','));
  
  // 添加数据行
  data.forEach(row => {
    const values = headers.map(header => escapeCSVField(row[header] || ''));
    csvRows.push(values.join(','));
  });
  
  const csvContent = csvRows.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 转义CSV字段
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
