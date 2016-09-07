using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.VerseParsing
{
    public class HierarchyContext
    {
        public ParagraphState ParagraphState { get; private set; }

        public IHierarchyInfo HierarchyInfo { get; private set; }       // здесь будут хранить специфическая для каждого state информация. Например, для таблицы - инфа по первому ряду ячеек. Надо подумать, как в провайдере можно передать сюда инфу, например, в случае списка в OneNote.

        public List<ParagraphParseResult> ParseResults { get; private set; }

        public HierarchyContext ParentHierarchy { get; private set; }

        public HierarchyContext(ParagraphState paragraphState, HierarchyContext parentHierarchy)
        {
            ParagraphState = paragraphState;            
            ParentHierarchy = parentHierarchy;

            ParseResults = new List<ParagraphParseResult>();
        }
    }
}
