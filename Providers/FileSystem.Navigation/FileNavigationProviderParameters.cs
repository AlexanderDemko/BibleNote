using System.Collections.Generic;
using BibleNote.Services.NavigationProvider.Contracts;

namespace BibleNote.Providers.FileSystem.Navigation
{
    public class FileNavigationProviderParameters : NavigationProviderParametersBase
    {
        public List<string> FolderPaths { get; set; }      
    }
}
