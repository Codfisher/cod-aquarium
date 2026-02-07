/**
 * 根據路徑字串，從根目錄 Handle 逐層尋找檔案
 * @param rootHandle 根目錄 Handle
 * @param path 相對路徑 (e.g. "models/furniture/chair.bin")
 */
export async function getFileFromPath(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
): Promise<File> {
  const cleanPath = path.replace(/^\.\/|^\//, '')
  const parts = cleanPath.split('/')
  const filename = parts.pop()

  if (!filename)
    throw new Error('Invalid path')

  let currentDir = rootHandle
  for (const dirName of parts) {
    currentDir = await currentDir.getDirectoryHandle(dirName)
  }

  const fileHandle = await currentDir.getFileHandle(filename)
  return await fileHandle.getFile()
}
