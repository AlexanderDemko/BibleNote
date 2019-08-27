﻿using BibleNote.Analytics.Domain.Entities;

namespace BibleNote.Analytics.Domain.Contracts
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
