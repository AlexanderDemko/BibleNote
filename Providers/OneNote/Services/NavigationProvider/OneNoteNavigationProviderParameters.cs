using System.Collections.Generic;
using BibleNote.Providers.OneNote.Services.Models;
using BibleNote.Services.NavigationProvider.Contracts;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProviderParameters : NavigationProviderParametersBase
    {
        public List<OneNoteHierarchyInfo> HierarchyItems { get; set; }
    }
}
