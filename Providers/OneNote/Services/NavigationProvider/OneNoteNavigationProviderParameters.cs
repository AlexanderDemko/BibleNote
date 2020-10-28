using System.Collections.Generic;
using BibleNote.Providers.OneNote.Services.NavigationProvider.Models;
using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProviderParameters : INavigationProviderParameters
    {
        public List<OneNoteHierarchyInfo> HierarchyItems { get; set; }
    }
}
