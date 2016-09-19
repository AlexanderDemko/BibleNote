﻿using BibleNote.Analytics.Contracts.Providers;

namespace BibleNote.Analytics.Providers.Navigation.File
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
