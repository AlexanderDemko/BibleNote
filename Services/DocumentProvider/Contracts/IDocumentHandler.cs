using System;

namespace BibleNote.Services.DocumentProvider.Contracts
{
    public interface IDocumentHandler : IDisposable
    {
        void SetDocumentChanged();        
    }
}