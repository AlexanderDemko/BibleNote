using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Infrastructure.AutoMapper;
using System;

namespace BibleNote.Middleware.AnalysisSessions.SharedViewModels
{
    public class AnalysisSessionVm : IMapFrom<AnalysisSession>
    {
        public int Id { get; set; }

        public DateTime? StartTime { get; set; }

        public DateTime? FinishTime { get; set; }

        public int NavigationProviderId { get; set; }

        public int CreatedDocumentsCount { get; set; }

        public int UpdatedDocumentsCount { get; set; }

        public int DeletedDocumentsCount { get; set; }

        public AnalysisSessionStatus Status { get; set; }
    }
}
