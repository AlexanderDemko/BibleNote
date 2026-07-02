using System.Collections.Generic;
using BibleNote.Providers.OneNote.Services.Models;
using BibleNote.Services.NavigationProvider;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProviderParameters : NavigationProviderParametersBase
    {
        public IList<OneNoteHierarchyInfo> HierarchyItems { get; set; }
    }
}
