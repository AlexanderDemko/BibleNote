using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing.Contracts;

namespace BibleNote.Services.VerseProcessing
{
    class SaveVerseRelationsProcessing : IDocumentParseResultProcessing
    {
        public int Order => 1;

        readonly ITrackingDbContext analyticsContext;

        public SaveVerseRelationsProcessing(ITrackingDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;
        }

        public async Task ProcessAsync(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default)
        {
            var verseRelations = VerseRelationsCalculator.Calculate(documentResult).Relations.Select(relation => new VerseRelation
            {
                VerseId = relation.VerseId,
                RelativeVerseId = relation.RelativeVerseId,
                DocumentParagraph = relation.Paragraph.Paragraph,
                DocumentParagraphId = relation.Paragraph.Paragraph.Id,
                RelativeDocumentParagraph = relation.RelativeParagraph.Paragraph,
                RelativeDocumentParagraphId = relation.RelativeParagraph.Paragraph.Id,
                RelationWeight = relation.RelationWeight
            });

            await this.analyticsContext.DoInTransactionAsync(async (token) =>
            {
                this.analyticsContext.VerseRelationRepository.AddRange(verseRelations);
                await this.analyticsContext.SaveChangesAsync(token);
                return true;
            }, cancellationToken);
        }
    }
}
