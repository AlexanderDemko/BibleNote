using System;

namespace BibleNote.Services.Contracts
{
    public interface IDocumentHandler : IAsyncDisposable
    {
        void SetDocumentChanged();
    }
}