using System;

namespace BibleNote.Services.DocumentProvider.Contracts
{
    public interface IDocumentHandler : IAsyncDisposable
    {
        void SetDocumentChanged();        
    }
}