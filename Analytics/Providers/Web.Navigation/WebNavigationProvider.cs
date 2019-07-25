using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.Web.Navigation
{
    public class WebNavigationProvider : INavigationProvider
    {
        public string Name
        {
            get
            {
                return "WebNavigationProvider";
            }
        }

        public string Description
        {
            get
            {
                return "Internet documents (.txt, .html, .docx, .doc.)";
            }
        }
    }
}
