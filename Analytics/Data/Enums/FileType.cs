using System;
using System.IO;

namespace BibleNote.Analytics.Domain.Enums
{
    public enum FileType
    {
        Html,
        Text,
        OneNote,
        Word,
        Pdf
    }

    public static class FileTypeHelper
    {
        public static readonly string[] SupportedFileExtensions = new[] { ".html", ".htm", ".txt", ".docx", ".pdf" };

        public static FileType GetFileType(string fileName)
        {
            var fileExtension = Path.GetExtension(fileName);
            switch(fileExtension)
            {
                case ".html":
                case ".htm":
                    return FileType.Html;
                case ".txt":
                    return FileType.Text;
                case ".docx":
                    return FileType.Word;
                case ".pdf":
                    return FileType.Pdf;
                default:
                    throw new NotSupportedException(fileExtension);
            }
        }
    }
}
