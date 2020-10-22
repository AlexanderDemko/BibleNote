using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System.Collections.Generic;

namespace BibleNote.Analytics.Providers.FileSystem.Navigation
{
    public class FileNavigationProviderParameters : INavigationProviderParameters
    {
        public List<string> FolderPaths { get; set; }
    }
}
