using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System.Collections.Generic;

namespace BibleNote.Analytics.Providers.OneNote.Navigation
{
    public class OneNoteNavigationProviderParameters: INavigationProviderParameters
    {
        public List<OneNoteLevelInfo> Levels { get; set; }
    }
}
