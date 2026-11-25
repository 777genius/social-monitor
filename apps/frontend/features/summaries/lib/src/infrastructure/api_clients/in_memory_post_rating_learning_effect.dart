String inMemoryPostRatingLearningEffect(int rating) {
  if (rating <= 2) return 'negative';
  if (rating == 3) return 'neutral';
  return 'positive';
}
