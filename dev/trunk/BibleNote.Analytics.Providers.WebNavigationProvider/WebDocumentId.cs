using BibleNote.Analytics.Contracts.Providers;
using System;

namespace BibleNote.Analytics.Providers.Navigation.Web
{
    public class WebDocumentId: IDocumentId
    {
        public Uri Uri { get; private set; }

        public bool IsReadonly { get { return true; } }

        public bool Changed { get { return false; } set { } }

        public WebDocumentId(Uri uri)
        {
            Uri = uri;            
        }
    }
}
