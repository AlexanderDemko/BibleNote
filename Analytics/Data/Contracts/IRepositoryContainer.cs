using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Analytics.Data.Contracts
{
    public interface IRepositoryContainer
    {
        IReadOnlyRepository<Document> DocumentRepository { get; }
        IReadOnlyRepository<DocumentFolder> DocumentFolderRepository { get; }
        IReadOnlyRepository<DocumentParagraph> DocumentParagraphRepository { get; }
        IReadOnlyRepository<VerseEntry> VerseEntryRepository { get; }
        IReadOnlyRepository<VerseRelation> VerseRelationRepository { get; }        
    }
}
