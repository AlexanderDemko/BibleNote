namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IDocumentId
    {
        int DocumentId { get; }

        bool Changed { get; set; }

        bool IsReadonly { get; }        
    }
}
