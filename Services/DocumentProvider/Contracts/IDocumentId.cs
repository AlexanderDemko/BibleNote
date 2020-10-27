namespace BibleNote.Services.DocumentProvider.Contracts
{
    public interface IDocumentId
    {
        int DocumentId { get; }

        bool Changed { get; }

        bool IsReadonly { get; }

        void SetReadonly();

        void SetChanged();
    }
}
