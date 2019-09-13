using BibleNote.Analytics.Domain.Entities;

namespace BibleNote.Analytics.Domain.Contracts
{
    public interface ITrackingDbContext : IUnitOfWork
    {
        ITrackingRepository<Document> DocumentRepository { get; }
        ITrackingRepository<DocumentFolder> DocumentFolderRepository { get; }
        ITrackingRepository<DocumentParagraph> DocumentParagraphRepository { get; }
        ITrackingRepository<VerseEntry> VerseEntryRepository { get; }
        ITrackingRepository<VerseRelation> VerseRelationRepository { get; }
    }
}
