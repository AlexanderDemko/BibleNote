using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.OneNote.Navigation
{
    public class OneNoteNavigationProvider : INavigationProvider
    {
        public string Name
        {
            get
            {
                return "OneNoteNavigationProvider";
            }
        }

        public string Description
        {
            get
            {
                return "OneNote pages.";
            }
        }        
    }
}
