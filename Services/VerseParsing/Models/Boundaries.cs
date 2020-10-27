namespace BibleNote.Services.VerseParsing.Models
{
    public struct Boundaries
    {
        public int StartIndex { get; set; }

        public int EndIndex { get; set; }

        public Boundaries(int startIndex, int endIndex)
        {
            StartIndex = startIndex;
            EndIndex = endIndex;
        }
    }
}
