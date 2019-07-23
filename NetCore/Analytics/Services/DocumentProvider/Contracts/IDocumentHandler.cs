using System;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IDocumentHandler : IDisposable
    {
        void SetDocumentChanged();        
    }
}