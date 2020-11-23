using BibleNote.Domain.Enums;
using System;

namespace BibleNote.Domain.Entities
{
    public class AnalysisSession
    {
        public int Id { get; set; }

        public DateTime? StartTime { get; set; }

        public DateTime? FinishTime { get; set; }

        public DateTime GetDocumentsInfoTime { get; set; }

        public int NavigationProviderId { get; set; }

        public int CreatedDocumentsCount { get; set; }

        public int UpdatedDocumentsCount { get; set; }

        public int DeletedDocumentsCount { get; set; }

        public NavigationProviderInfo NavigationProvider { get; set; }

        public AnalysisSessionStatus Status { get; set; }
    }
}
