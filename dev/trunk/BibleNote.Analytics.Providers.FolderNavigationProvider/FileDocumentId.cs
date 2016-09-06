using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.FileNavigationProvider
{
    public class FileDocumentId: IDocumentId
    {
        public string FilePath { get; private set; }

        public FileDocumentId(string filePath)
        {
            FilePath = filePath;
        }
    }
}
