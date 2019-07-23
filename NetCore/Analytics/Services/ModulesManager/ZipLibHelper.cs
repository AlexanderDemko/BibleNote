using System;
using System.Linq;
using System.IO;
using ICSharpCode.SharpZipLib.Zip;

namespace BibleNote.Analytics.Services.ModulesManager
{
    static class ZipLibHelper
    {
        public static void ExtractZipFile(byte[] fileData, string directoryPath, string[] relativeFilePathsToExtract = null)
        {
            if (!Directory.Exists(directoryPath))
                Directory.CreateDirectory(directoryPath);

            ZipStrings.CodePage = 866;

            using (MemoryStream ms = new MemoryStream(fileData))
            {
                using (ZipInputStream s = new ZipInputStream(ms))
                {
                    ZipEntry theEntry;
                    while ((theEntry = s.GetNextEntry()) != null)
                    {
                        string relativeDirectoryName = Path.GetDirectoryName(theEntry.Name);
                        string directoryName = Path.Combine(directoryPath, relativeDirectoryName);
                        string relativeFileName = Path.GetFileName(theEntry.Name);
                        string fileName = Path.Combine(directoryName, relativeFileName);


                        // create directory
                        if (relativeDirectoryName.Length > 0)
                        {
                            Directory.CreateDirectory(directoryName);
                        }

                        if (relativeFileName != String.Empty)
                        {
                            if (relativeFilePathsToExtract == null || relativeFilePathsToExtract.Contains(relativeFileName))
                            {
                                using (FileStream streamWriter = File.Create(fileName))
                                {
                                    ZipLibHelper.CopyZipEntryToStream(s, streamWriter);
                                }
                            }
                        }
                    }
                }
            }

        }

        public static void PackfilesToZip(string tempFolderPath, string targetFilePath)
        {
            ZipStrings.CodePage = 866;
            // Depending on the directory this could be very large and would require more attention
            // in a commercial package.
            string[] filenames = Directory.GetFiles(tempFolderPath);

            // 'using' statements guarantee the stream is closed properly which is a big source
            // of problems otherwise.  Its exception safe as well which is great.
            using (ZipOutputStream s = new ZipOutputStream(File.Create(targetFilePath)))
            {
                s.SetLevel(9); // 0 - store only to 9 - means best compression

                byte[] buffer = new byte[4096];

                foreach (string file in filenames)
                {
                    // Using GetFileName makes the result compatible with XP
                    // as the resulting path is not absolute.
                    ZipEntry entry = new ZipEntry(Path.GetFileName(file));

                    // Setup the entry data as required.

                    // Crc and size are handled by the library for seakable streams
                    // so no need to do them here.

                    // Could also use the last write time or similar for the file.
                    entry.DateTime = DateTime.Now;
                    s.PutNextEntry(entry);

                    using (FileStream fs = File.OpenRead(file))
                    {

                        // Using a fixed size buffer here makes no noticeable difference for output
                        // but keeps a lid on memory usage.
                        int sourceBytes;
                        do
                        {
                            sourceBytes = fs.Read(buffer, 0, buffer.Length);
                            s.Write(buffer, 0, sourceBytes);
                        } while (sourceBytes > 0);
                    }
                }

                // Finish/Close arent needed strictly as the using statement does this automatically

                // Finish is important to ensure trailing information for a Zip file is appended.  Without this
                // the created file would be invalid.
                s.Finish();

                // Close is important to wrap things up and unlock the file.
                s.Close();
            }
        }

        private static void CopyZipEntryToStream(ZipInputStream zipStream, Stream destStream)
        {
            byte[] data = new byte[2048];
            while (true)
            {
                int size = zipStream.Read(data, 0, data.Length);
                if (size > 0)
                {
                    destStream.Write(data, 0, size);
                }
                else
                {
                    break;
                }
            }
        }
    }
}
