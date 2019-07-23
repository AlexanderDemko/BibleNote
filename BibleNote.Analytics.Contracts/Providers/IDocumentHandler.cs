using System;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IDocumentHandler : IDisposable
    {
        void SetDocumentChanged();        
    }
}