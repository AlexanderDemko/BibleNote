using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.FileNavigationProvider
{
    public class FileNavigationProvider : INavigationProvider
    {
        public string Name
        {
            get
            {
                return "FileNavigationProvider";
            }
        }

        public string Description
        {
            get
            {
                return "Folder with files .txt, .html, .docx, .doc.";
            }
        }        
    }
}
