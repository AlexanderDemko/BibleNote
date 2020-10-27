using System.Collections.Generic;
using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProviderParameters : INavigationProviderParameters
    {
        public List<OneNoteLevelInfo> Levels { get; set; }
    }
}
