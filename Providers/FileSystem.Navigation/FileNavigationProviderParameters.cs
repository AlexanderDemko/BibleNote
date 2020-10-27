using System.Collections.Generic;
using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.FileSystem.Navigation
{
    public class FileNavigationProviderParameters : INavigationProviderParameters
    {
        public List<string> FolderPaths { get; set; }
    }
}
